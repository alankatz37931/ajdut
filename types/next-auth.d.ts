import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "PROJECT_OWNER" | "CO_ADMIN" | "PARTNER" | "PLATFORM";
    } & DefaultSession["user"];
  }
  interface User {
    role: "ADMIN" | "PROJECT_OWNER" | "CO_ADMIN" | "PARTNER" | "PLATFORM";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "PROJECT_OWNER" | "CO_ADMIN" | "PARTNER" | "PLATFORM";
  }
}
