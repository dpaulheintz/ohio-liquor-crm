import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle className="text-xl">Account Pending</CardTitle>
          <CardDescription>
            Your account is awaiting admin approval. You&apos;ll be able to access the CRM once an admin activates your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Contact your team admin if you need immediate access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
