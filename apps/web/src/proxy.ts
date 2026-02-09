export { auth as proxy } from "@/auth";

export const config = {
  // Protect the /chat routes only - let landing page and auth routes be public
  matcher: ["/chat/:path*"],
};
