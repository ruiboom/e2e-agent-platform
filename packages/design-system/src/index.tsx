// Themed UI primitives for the console. Tailwind classes resolve to the Lloyds
// tokens via the preset (tailwind-preset.mjs); tokens.css must be imported once
// at the app root.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ── Button ────────────────────────────────────────────────────────────
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-pill font-sans font-bold transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand text-ink-inverse hover:bg-brand-deep",
        secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-page",
        ghost: "bg-transparent text-ink hover:bg-surface-page",
        danger: "bg-danger text-ink-inverse hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-[14px]",
        md: "h-11 px-5 text-[16px]",
        lg: "h-12 px-6 text-[18px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

// ── Card ──────────────────────────────────────────────────────────────
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface shadow-1", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-2", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-xl font-bold text-ink", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[14px] text-ink-3", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-2", className)} {...props} />;
}

// ── Badge ─────────────────────────────────────────────────────────────
const badgeVariants = cva("inline-flex items-center rounded-pill px-2.5 py-0.5 text-[12px] font-bold", {
  variants: {
    tone: {
      neutral: "bg-surface-page text-ink-2 border border-line",
      brand: "bg-brand-calm text-ink",
      success: "bg-brand-calm text-brand-deep",
      danger: "bg-[var(--lb-error-bg)] text-danger",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}
export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// ── Form ──────────────────────────────────────────────────────────────
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-md border border-line bg-surface px-3 text-[16px] text-ink outline-none placeholder:text-[var(--lb-placeholder)] focus-visible:border-brand",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-[14px] font-bold text-ink-2", className)} {...props} />;
}
