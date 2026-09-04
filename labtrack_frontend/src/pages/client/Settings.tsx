import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_LABELS } from "@/contexts/AuthContext";
import { changePassword } from "@/api/auth";
import { ApiError } from "@/api/client";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Your account details.</p>
      </div>

      {/* Real profile — read-only, sourced from the authenticated account */}
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField label="Full Name" value={user?.fullName ?? "—"} />
          <ReadOnlyField label="School ID" value={user?.schoolId ?? "—"} mono />
          <ReadOnlyField label="Email" value={user?.email ?? "—"} />
          <ReadOnlyField label="Role" value={user ? ROLE_LABELS[user.role] : "—"} />
        </CardContent>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}

function ReadOnlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} readOnly className={mono ? "font-mono" : undefined} style={{ background: "#f6f8fa" }} />
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader><CardTitle className="text-base">Change Password</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Current password</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm new password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "#b42318" }}>
            <AlertTriangle className="size-3.5" /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "#1a7f37" }}>
            <CheckCircle2 className="size-3.5" /> Password changed successfully.
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={submit}
            disabled={isSubmitting || !currentPassword || !newPassword}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSubmitting ? "Updating..." : "Update password"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}