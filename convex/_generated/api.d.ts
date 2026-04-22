/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as chats from "../chats.js";
import type * as chql_generated_CriteriaQueryAntlrLexer from "../chql/generated/CriteriaQueryAntlrLexer.js";
import type * as chql_generated_CriteriaQueryAntlrParser from "../chql/generated/CriteriaQueryAntlrParser.js";
import type * as chql_generated_CriteriaQueryAntlrParserListener from "../chql/generated/CriteriaQueryAntlrParserListener.js";
import type * as chql_hash from "../chql/hash.js";
import type * as chql_parse from "../chql/parse.js";
import type * as evaluation from "../evaluation.js";
import type * as evaluationHelpers from "../evaluationHelpers.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  auth: typeof auth;
  chats: typeof chats;
  "chql/generated/CriteriaQueryAntlrLexer": typeof chql_generated_CriteriaQueryAntlrLexer;
  "chql/generated/CriteriaQueryAntlrParser": typeof chql_generated_CriteriaQueryAntlrParser;
  "chql/generated/CriteriaQueryAntlrParserListener": typeof chql_generated_CriteriaQueryAntlrParserListener;
  "chql/hash": typeof chql_hash;
  "chql/parse": typeof chql_parse;
  evaluation: typeof evaluation;
  evaluationHelpers: typeof evaluationHelpers;
  http: typeof http;
  messages: typeof messages;
  migrations: typeof migrations;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
