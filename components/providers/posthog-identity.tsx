"use client"

import { useEffect, useRef } from "react"
import posthog from "posthog-js"
import { useAuth } from "@/hooks/use-auth"

export function PostHogIdentity() {
  const { user } = useAuth()
  const identifiedUserId = useRef<string | null>(null)
  const identifiedOrganizationId = useRef<string | null>(null)

  useEffect(() => {
    if (!user || process.env.NODE_ENV === "test") return

    const userId = String(user.user.id)
    const organizationId = String(user.org.id)

    if (identifiedUserId.current !== userId) {
      posthog.identify(userId, {
        email: user.user.email,
        name: user.user.display_name,
        role: user.role.name,
      })
      identifiedUserId.current = userId
    }

    if (identifiedOrganizationId.current !== organizationId) {
      posthog.group("organization", organizationId, {
        name: user.org.name,
        plan: user.subscription.plan.slug,
      })
      identifiedOrganizationId.current = organizationId
    }
  }, [user])

  return null
}
