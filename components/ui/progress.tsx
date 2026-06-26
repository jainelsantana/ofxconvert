import * as React from "react";
import { twMerge } from "tailwind-merge";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={twMerge("ofx-progress-track relative h-2 w-full", className)}
        {...props}
      >
        <div
          className="ofx-progress-fill w-full flex-1 duration-500 ease-out"
          style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";
