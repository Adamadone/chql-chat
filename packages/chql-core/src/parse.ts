// See ./CONTEXT.md for module overview.
import {
  CharStream,
  CommonTokenStream,
  BaseErrorListener,
  type Recognizer,
  type Token,
  type RecognitionException,
  type ATNSimulator,
} from "antlr4ng";
import { CriteriaQueryAntlrLexer } from "./generated/CriteriaQueryAntlrLexer.js";
import { CriteriaQueryAntlrParser } from "./generated/CriteriaQueryAntlrParser.js";

class ThrowingErrorListener extends BaseErrorListener {
  public override syntaxError<S extends Token, T extends ATNSimulator>(
    _recognizer: Recognizer<T>,
    _offendingSymbol: S | null,
    line: number,
    column: number,
    msg: string,
    _e: RecognitionException | null,
  ): void {
    throw new Error(`line ${line}:${column} ${msg}`);
  }
}

export type ParseResult = { ok: true } | { ok: false; error: string };

export function parseChql(query: string): ParseResult {
  try {
    const input = CharStream.fromString(query);
    const lexer = new CriteriaQueryAntlrLexer(input);
    lexer.removeErrorListeners();
    lexer.addErrorListener(new ThrowingErrorListener());

    const tokens = new CommonTokenStream(lexer);
    const parser = new CriteriaQueryAntlrParser(tokens);
    parser.removeErrorListeners();
    parser.addErrorListener(new ThrowingErrorListener());

    parser.parse();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
