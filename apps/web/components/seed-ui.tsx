"use client";

import * as React from "react";
import { ActionButton, Badge, TextField } from "@seed-design/react";

/** G-ROAD's small SEED Design adapter. Keep SEED's native prop names. */
export type SeedButtonProps = React.ComponentProps<typeof ActionButton>;

export const SeedButton = React.forwardRef<HTMLButtonElement, SeedButtonProps>(
  ({ variant = "brandSolid", size = "large", type = "button", ...props }, ref) => (
    <ActionButton ref={ref} variant={variant} size={size} type={type} {...props} />
  ),
);
SeedButton.displayName = "SeedButton";

export type SeedBadgeProps = React.ComponentProps<typeof Badge.Root> & {
  children: React.ReactNode;
};

export const SeedBadge = React.forwardRef<HTMLSpanElement, SeedBadgeProps>(
  ({ children, tone = "neutral", variant = "weak", size = "medium", ...props }, ref) => (
    <Badge.Root ref={ref} tone={tone} variant={variant} size={size} {...props}>
      <Badge.Label>{children}</Badge.Label>
    </Badge.Root>
  ),
);
SeedBadge.displayName = "SeedBadge";

export type SeedTextInputProps = Omit<React.ComponentProps<typeof TextField.Input>, "aria-label"> & {
  label: string;
  rootProps?: React.ComponentProps<typeof TextField.Root>;
};

export const SeedTextInput = React.forwardRef<HTMLInputElement, SeedTextInputProps>(
  ({ label, rootProps, ...props }, ref) => (
    <TextField.Root size="large" {...rootProps}>
      <TextField.Input ref={ref} aria-label={label} {...props} />
    </TextField.Root>
  ),
);
SeedTextInput.displayName = "SeedTextInput";

export type SeedTextareaProps = Omit<React.ComponentProps<typeof TextField.Textarea>, "aria-label"> & {
  label: string;
  rootProps?: React.ComponentProps<typeof TextField.Root>;
};

export const SeedTextarea = React.forwardRef<HTMLTextAreaElement, SeedTextareaProps>(
  ({ label, rootProps, ...props }, ref) => (
    <TextField.Root size="large" {...rootProps}>
      <TextField.Textarea ref={ref} aria-label={label} {...props} />
    </TextField.Root>
  ),
);
SeedTextarea.displayName = "SeedTextarea";
