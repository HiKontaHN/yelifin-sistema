// components/nav-user-menu.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useMe } from "@/hooks/swr/use-me";
import { usePrivacyMode } from "@/context/privacy-mode-context";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Settings, LogOut, Shield, Crown, Eye, EyeOff } from "lucide-react";

export function NavUserMenu() {
  const { push } = useRouter();
  const { user, firebaseUser } = useAuth();
  const { org } = useMe();
  const { isPrivate, toggle: togglePrivacy } = usePrivacyMode();

  const isAdmin = user?.subscription?.plan?.slug === "admin";

  const displayName =
    user?.profile?.business_name       ||
    org?.name                          ||
    firebaseUser?.displayName          ||
    firebaseUser?.email?.split("@")[0] ||
    "Usuario";

  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      document.cookie = "token=; Max-Age=0; path=/";
      toast.success("Sesión cerrada exitosamente");
      push("/");
    } catch {
      toast.error("Error al cerrar sesión");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center rounded-full transition-opacity hover:opacity-90">
          <Avatar className="size-8">
            <AvatarImage
              src={org?.logo_url ?? user?.profile?.business_logo_url ?? undefined}
              alt={displayName}
              className="object-cover"
            />
            <AvatarFallback className="bg-primary text-primary-foreground text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="bottom" align="end" className="w-56">
        <div className="px-2 py-2 border-b mb-1">
          <p className="text-sm font-medium truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground truncate">{firebaseUser?.email}</p>
          {isAdmin ? (
            <span className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-emerald-600">
              <Shield className="size-3" /> Admin
            </span>
          ) : (
            user?.subscription?.plan?.name && (
              <Link
                href="/settings/billing"
                className="inline-flex items-center gap-1 mt-1.5 text-xs text-primary font-medium hover:underline"
              >
                <Crown className="size-3" /> Plan {user.subscription.plan.name}
              </Link>
            )
          )}
        </div>

        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={togglePrivacy}
          className="cursor-pointer"
        >
          {isPrivate
            ? <EyeOff className="mr-2 size-4" />
            : <Eye    className="mr-2 size-4" />
          }
          {isPrivate ? "Mostrar valores" : "Ocultar valores"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/profile" className="flex items-center cursor-pointer">
            <Settings className="mr-2 size-4" /> Configuración
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
          <LogOut className="mr-2 size-4" /> Cerrar Sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
