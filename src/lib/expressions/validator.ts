import { removeExpressionMarker } from ".";
import { Position } from "../../types";
import { ValidationError } from "../parser/validator";
import { iteratePath, PropertyPath } from "../utils/path";
import { ExpressionContext, ExpressionEvaluator } from "./evaluator";
import { ExpressionLexer, parser } from "./parser";
import { ContextProvider } from "./types";

class ExpressionValidator extends ExpressionEvaluator {
  constructor(
    private contextProvider: ContextProvider,
    private errors: ValidationError[],
    private pos: Position
  ) {
    super();
  }

  protected getContextValue(contextName: string, path: PropertyPath) {
    const ctx = this.contextProvider.get(contextName as any);

    if (!ctx || iteratePath(path, ctx) === undefined) {
      this.errors.push({
        message: `Unknown context access: '${contextName}.${path.join(".")}'`,
        pos: this.pos,
      });
    }

    return ctx;
  }
}

export function validateExpression(
  input: string,
  posOffset: number,
  errors: ValidationError[],
  contextProvider: ContextProvider
) {
  const expressionPosition: Position = [posOffset, posOffset + input.length];

  input = removeExpressionMarker(input);

  // Check for parser errors
  const lexResult = ExpressionLexer.tokenize(input);
  parser.input = lexResult.tokens;
  if (lexResult.errors.length > 0 || parser.errors.length > 0) {
    errors.push({
      message: "Invalid expression",
      pos: expressionPosition,
    });

    return;
  }

  const cst = parser.expression();

  try {
    const result = new ExpressionValidator(
      contextProvider,
      errors,
      expressionPosition
    ).visit(cst, {} as ExpressionContext);

    if (result === undefined) {
      errors.push({
        message: "Invalid expression",
        pos: expressionPosition,
      });
    }
  } catch {
    errors.push({
      message: "Error evaluating expression",
      pos: expressionPosition,
    });
  }
}
