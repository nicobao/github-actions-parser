import { safeLoad } from "js-yaml";
import { Context } from "../../../types";
import {
  CustomValue,
  CustomValueProvider,
  CustomValueValidation,
  NodeDesc,
} from "../../parser/schema";
import { TTLCache } from "../../utils/cache";
import { iteratePath, PropertyPath } from "../../utils/path";
import { RemoteUses, Step, Workflow } from "../../workflow";

async function getActionYamlContent(
  context: Context,
  uses: RemoteUses
): Promise<string | undefined> {
  // TODO: CS: Think about how to surface API errors to consumers of the library. E.g., the token might
  // be invalid, or it might not meet SSO requirements
  let contentResp = await context.client.repos.getContent({
    owner: uses.owner,
    repo: uses.repository,
    path: "action.yml",
    ref: uses.ref,
  });

  if (contentResp.status === 404) {
    contentResp = await context.client.repos.getContent({
      owner: uses.owner,
      repo: uses.repository,
      path: "action.yaml",
      ref: uses.ref,
    });
  }

  if (contentResp?.data?.content) {
    // Response is base64 encoded, so decode
    const buff = new Buffer(contentResp.data.content, "base64");
    const text = buff.toString("ascii");
    return text;
  }

  return undefined;
}

export const actionsInputProvider = (
  context: Context,
  cache: TTLCache<any>
): CustomValueProvider => async (
  desc: NodeDesc,
  workflow: Workflow | undefined,
  path: PropertyPath
): Promise<CustomValue[]> => {
  if (!workflow) {
    return [];
  }

  // jobs:
  //   foo:
  //     steps:
  //     - uses: "actions/checkout@v2"
  //       with:
  //         | <- This is where this gets called

  // First, find the `uses`. Strip of the last `with` in the path, need the step level
  if (path[path.length - 1] === "with") {
    path.pop();
  }

  const step = iteratePath(path, workflow) as Step;
  if (!step || !("uses" in step) || step.uses.type !== "remote") {
    return [];
  }

  const uses = step.uses;

  try {
    return cache.get(
      `${uses.owner}/${uses.repository}@${uses.ref}`,
      undefined,
      async () => {
        const text = await getActionYamlContent(context, uses);
        if (text) {
          const { inputs } = safeLoad(text);
          if (inputs) {
            return Object.keys(inputs).map((key) => ({
              value: key,
              description: `${
                inputs[key].description || ""
              } \n\nrequired: \`${!!inputs[key].required}\` \n\n${
                (inputs[key].default && `default:\`${inputs[key].default}\``) ||
                ""
              }`,
              validation: !!inputs[key].required
                ? CustomValueValidation.Required
                : CustomValueValidation.None,
            }));
          }
        }
      }
    );
  } catch (e) {
    console.error(e);
  }

  return [];
};