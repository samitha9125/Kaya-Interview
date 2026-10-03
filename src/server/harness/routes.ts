import "server-only";
import { app } from "@/server/composition";
import { postGuest, postLogin, postLogout } from "./auth-routes";

// Entry points for app/ route files: each takes its dependencies from the
// composition root, so app/ never sees them (ARCHITECTURE §4).
export const loginRoute = (request: Request) => postLogin(request, app());
export const logoutRoute = (request: Request) => postLogout(request, app());
export const guestRoute = (request: Request) => postGuest(request, app());
