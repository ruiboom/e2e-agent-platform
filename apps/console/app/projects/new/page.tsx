import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@agent-platform/design-system";

import { createProjectAction } from "../actions";

// Reaching this page already requires project:create (enforced in middleware).
export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
          <CardDescription>A workspace and the root of its artifact lineage.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createProjectAction} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Support assistant" required />
            </div>
            <div>
              <Label htmlFor="slug">Slug (optional)</Label>
              <Input id="slug" name="slug" placeholder="auto-derived from name" />
            </div>
            <div>
              <Label htmlFor="domain">Domain (optional)</Label>
              <Input id="domain" name="domain" placeholder="banking" />
            </div>
            <Button type="submit">Create project</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
