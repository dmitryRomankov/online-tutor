export function validInvitationToken(value: string | null): value is string {
  return Boolean(value && /^[a-f0-9]{64}$/.test(value));
}
export function invitationDestination(value: string | null) {
  return validInvitationToken(value) ? `/invite?token=${value}` : null;
}
export function authHref(mode: 'login' | 'register', invitation: string | null) {
  const path = mode === 'login' ? '/sign-in' : '/register';
  return validInvitationToken(invitation) ? `${path}?invitation=${invitation}` : path;
}
