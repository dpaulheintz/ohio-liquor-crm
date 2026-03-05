'use client';

import { useState, useEffect, useCallback } from 'react';
import { getProfiles, updateProfileRole, approveUser } from '@/app/actions/users';
import { Profile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProfiles();
      setProfiles(data);
    } catch (err) {
      console.error('Failed to fetch profiles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  async function handleRoleChange(userId: string, role: string) {
    try {
      await updateProfileRole(userId, role as 'admin' | 'rep' | 'viewer');
      toast.success('Role updated');
      fetch();
    } catch {
      toast.error('Failed to update role');
    }
  }

  async function handleApprove(userId: string) {
    try {
      await approveUser(userId);
      toast.success('User approved');
      fetch();
    } catch {
      toast.error('Failed to approve user');
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">User Management</h1>
      <p className="text-sm text-muted-foreground">
        Manage user accounts, approve new signups, and assign roles.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : profiles.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Users className="mx-auto mb-3 h-10 w-10" />
          <p>No users</p>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((profile) => (
            <Card key={profile.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback>
                    {(profile.full_name || profile.email || '?')[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {profile.full_name || profile.email}
                    </span>
                    {!profile.is_approved && (
                      <Badge variant="destructive" className="text-xs">
                        Pending
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {profile.email}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!profile.is_approved && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleApprove(profile.id)}
                    >
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Approve
                    </Button>
                  )}
                  <Select
                    value={profile.role}
                    onValueChange={(v) => handleRoleChange(profile.id, v)}
                  >
                    <SelectTrigger className="w-[100px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="rep">Rep</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
