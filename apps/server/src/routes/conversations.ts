import { Hono } from "hono";
import {
  deleteConversation,
  getConversation,
  getMessages,
  listConversations,
} from "../store.js";

export const conversationsRoute = new Hono();

conversationsRoute.get("/", (c) => {
  return c.json({ conversations: listConversations() });
});

conversationsRoute.get("/:id", (c) => {
  const id = c.req.param("id");
  const conversation = getConversation(id);
  if (!conversation) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ conversation, messages: getMessages(id) });
});

conversationsRoute.delete("/:id", (c) => {
  deleteConversation(c.req.param("id"));
  return c.json({ ok: true });
});
