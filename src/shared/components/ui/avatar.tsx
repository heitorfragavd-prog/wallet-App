import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, src, ...props }, ref) => {
  const normalizedSrc = React.useMemo(() => {
    if (typeof src === "string" && typeof window !== "undefined") {
      if (
        src.includes("hdeguzxkdvebdrrutbnx.supabase.co") &&
        import.meta.env.VITE_SUPABASE_URL?.includes("/supabase-proxy")
      ) {
        return src.replace(
          "https://hdeguzxkdvebdrrutbnx.supabase.co",
          `${window.location.origin}/supabase-proxy`
        );
      }
    }
    return src;
  }, [src]);

  return (
    <AvatarPrimitive.Image
      ref={ref}
      src={normalizedSrc}
      className={cn("aspect-square h-full w-full object-cover", className)}
      {...props}
    />
  );
})
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
