"use client"

import * as React from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Toasts on the popover surface. The theme follows data-theme on <html> (src/ui/theme.ts), not next-themes.
function useDocTheme(): "light" | "dark" {
  const read = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light")
  const [theme, setTheme] = React.useState<"light" | "dark">(read)
  React.useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => obs.disconnect()
  }, [])
  return theme
}

const Toaster = (props: ToasterProps) => {
  const theme = useDocTheme()
  return (
    <Sonner
      theme={theme}
      position="bottom-center"
      className="toaster group"
      offset={{ bottom: 24 }}
      mobileOffset={{ bottom: 96 }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--lv-popover)",
          "--normal-text": "var(--lv-text)",
          "--normal-border": "transparent",
          "--border-radius": "var(--lv-radius-field)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "surface-pop !font-[family-name:var(--lv-font-ui)] !text-[14.5px]",
          description: "!text-[var(--lv-muted)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
