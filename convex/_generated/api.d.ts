/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiConfig from "../aiConfig.js";
import type * as auth from "../auth.js";
import type * as benchmark from "../benchmark.js";
import type * as benchmarkLogic from "../benchmarkLogic.js";
import type * as chat from "../chat.js";
import type * as council from "../council.js";
import type * as http from "../http.js";
import type * as lifeManagement from "../lifeManagement.js";
import type * as openrouter from "../openrouter.js";
import type * as openrouterConfig from "../openrouterConfig.js";
import type * as router from "../router.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiConfig: typeof aiConfig;
  auth: typeof auth;
  benchmark: typeof benchmark;
  benchmarkLogic: typeof benchmarkLogic;
  chat: typeof chat;
  council: typeof council;
  http: typeof http;
  lifeManagement: typeof lifeManagement;
  openrouter: typeof openrouter;
  openrouterConfig: typeof openrouterConfig;
  router: typeof router;
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

export declare const components: {};
