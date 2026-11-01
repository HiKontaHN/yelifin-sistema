import { ModuleGuard } from "@/components/shared/module-guard";

export default function PeopleLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGuard module="CUSTOMERS">{children}</ModuleGuard>;
}
