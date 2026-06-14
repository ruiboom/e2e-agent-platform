import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agent-platform/design-system";

import { CANNED_USERS } from "@/lib/session";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = "/" } = await searchParams;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Phase 0 dev-stub login. Pick an identity to test RBAC — real OIDC drops into the same seam.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Object.entries(CANNED_USERS).map(([key, u]) => (
            <form key={key} action={login}>
              <input type="hidden" name="user" value={key} />
              <input type="hidden" name="next" value={next} />
              <Button
                type="submit"
                variant={u.role === "admin" ? "primary" : "secondary"}
                className="w-full"
              >
                Continue as {u.name}
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
