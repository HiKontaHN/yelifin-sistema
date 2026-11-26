import { Check, Circle } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

export function PasswordRequirements({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  return (
    <ul className={cn("grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs", className)}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li
            key={rule.label}
            className={cn("flex items-center gap-1.5", met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}
          >
            {met ? <Check className="size-3.5 shrink-0" /> : <Circle className="size-3 shrink-0" />}
            <span className="sr-only">{met ? "Requisito cumplido. " : "Requisito pendiente. "}</span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
