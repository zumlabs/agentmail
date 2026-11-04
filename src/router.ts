import { ApiError } from "./lib/http";
import type { Env } from "./types";

export interface RouteContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
  params: Record<string, string>;
  requestId: string;
  origin: string;
}

export type Handler = (context: RouteContext) => Promise<Response> | Response;

export interface Route {
  method: string;
  pattern: string;
  handler: Handler;
}

export function route(method: string, pattern: string, handler: Handler): Route {
  return { method: method.toUpperCase(), pattern, handler };
}

function splitPath(path: string): string[] {
  const parts = path.split("/").filter((part) => part !== "");
  return parts.map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
}

export interface RouteMatch {
  handler: Handler;
  params: Record<string, string>;
}

export function matchRoute(routes: Route[], method: string, pathname: string): RouteMatch {
  const segments = splitPath(pathname);
  let pathMatched = false;

  for (const candidate of routes) {
    const patternSegments = splitPath(candidate.pattern);
    if (patternSegments.length !== segments.length) continue;

    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < patternSegments.length; i += 1) {
      const pattern = patternSegments[i]!;
      const value = segments[i]!;
      if (pattern.startsWith(":")) {
        if (value === "") {
          matched = false;
          break;
        }
        params[pattern.slice(1)] = value;
      } else if (pattern !== value) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    pathMatched = true;
    if (candidate.method === method.toUpperCase()) return { handler: candidate.handler, params };
  }

  if (pathMatched) throw new ApiError(405, "method_not_allowed", `${method} is not allowed on ${pathname}`);
  throw new ApiError(404, "not_found", `No route for ${pathname}`);
}
