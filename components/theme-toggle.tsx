"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface ThemeToggleProps {
  isCollapsed?: boolean
}

export function ThemeToggle({ isCollapsed = false }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const isDark = mounted && resolvedTheme === "dark"
  const toggle = () => setTheme(isDark ? "light" : "dark")
  const label = isDark ? "Modo claro" : "Modo oscuro"

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={toggle}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            {mounted
              ? isDark
                ? <Sun className="size-4" />
                : <Moon className="size-4" />
              : <Moon className="size-4 opacity-0" />
            }
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <span className="text-sm">{label}</span>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <button
      onClick={toggle}
      className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
    >
      {mounted
        ? isDark
          ? <Sun className="size-4 shrink-0" />
          : <Moon className="size-4 shrink-0" />
        : <Moon className="size-4 shrink-0 opacity-0" />
      }
      <span className="text-sm">{label}</span>
    </button>
  )
}
