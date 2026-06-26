import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "link";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={twMerge(
          "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ora-cyan)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer shadow-sm",
          // Variants
          variant === "primary" && "btn-ora-primary shadow-md",
          variant === "secondary" && "bg-[var(--bg-dropzone)] text-[var(--text-primary)] hover:bg-[var(--bg-dropzone-hover)] border border-[var(--border-card)]",
          variant === "outline" && "btn-ora-outline",
          variant === "ghost" && "hover:bg-[var(--bg-dropzone-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] shadow-none",
          variant === "link" && "text-[var(--text-accent)] underline-offset-4 hover:underline shadow-none",
          // Sizes
          size === "sm" && "h-9 px-3 text-xs",
          size === "md" && "h-11 px-5 py-2.5 text-sm",
          size === "lg" && "h-12 px-8 text-base",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
