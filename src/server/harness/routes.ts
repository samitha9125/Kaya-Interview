import "server-only";
import { app } from "@/server/composition";
import { postGuest, postLogin, postLogout } from "./auth-routes";
import { postChatMessage, postResume } from "./chat-routes";
import {
  postClearCache,
  postFailureMode,
  postModelChoice,
  postResetLimit,
} from "./settings-routes";
import { readSettingsView } from "./settings-view";

// Entry points for app/ route files and pages: each takes its dependencies from the
// composition root, so app/ never sees them (ARCHITECTURE §4).
export const loginRoute = (request: Request) => postLogin(request, app());
export const logoutRoute = (request: Request) => postLogout(request, app());
export const guestRoute = (request: Request) => postGuest(request, app());
export const chatRoute = (request: Request) => postChatMessage(request, app());
export const resumeRoute = (request: Request) => postResume(request, app());
export const modelChoiceRoute = (request: Request) => postModelChoice(request, app());
export const resetLimitRoute = (request: Request) => postResetLimit(request, app());
export const clearCacheRoute = (request: Request) => postClearCache(request, app());
export const failureModeRoute = (request: Request) => postFailureMode(request, app());
export const settingsView = () => readSettingsView(app());
