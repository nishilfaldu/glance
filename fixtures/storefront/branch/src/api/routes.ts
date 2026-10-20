import { handleCheckout } from "./checkout";
import { refreshIfExpiring } from "../auth/refresh";

export const routes = {
  "POST /checkout": handleCheckout,
  "POST /session/refresh": async (req: { token: string }) => {
    const session = await refreshIfExpiring(req.token);
    if (!session) return { status: 401, body: { error: "unauthorized" } };
    return { status: 200, body: {}, headers: { "x-session-token": session.token } };
  },
};
