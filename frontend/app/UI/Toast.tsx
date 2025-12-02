"use client";

import React from "react";

export type ToastType = "info" | "success" | "warning" | "error";

export type ToastState = {
  visible: boolean;
  message: string;
  type?: ToastType;
};

type ToastProps = {
  toast: ToastState;
  offsetTop?: string;
  fontSize?: string;
};

export function Toast({
  toast,
  offsetTop = "47px",
  fontSize = "16px",
}: ToastProps) {
  if (!toast.visible) return null;

  const color =
    toast.type === "success"
      ? "hsl(var(--success))"
      : toast.type === "error"
      ? "#a70707"
      : toast.type === "warning"
      ? "hsl(var(--warning, 38 92% 50%))"
      : "hsl(var(--foreground))";

  return (
    <ol
      className="toaster group"
      data-sonner-toaster="true"
      data-sonner-theme="dark"
      data-y-position="top"
      data-x-position="center"
      dir="ltr"
      style={
        {
          "--front-toast-height": "53.5px",
          "--width": "356px",
          "--gap": "14px",
          "--offset-top": offsetTop,
          "--offset-right": "24px",
          "--offset-bottom": "24px",
          "--offset-left": "24px",
          "--mobile-offset-top": "16px",
          "--mobile-offset-right": "16px",
          "--mobile-offset-bottom": "16px",
          "--mobile-offset-left": "16px",
        } as React.CSSProperties
      }
    >
      <li
        tabIndex={0}
        className="group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg"
        data-sonner-toast=""
        data-styled="true"
        data-mounted="true"
        data-promise="false"
        data-swiped="false"
        data-removed="false"
        data-visible="true"
        data-y-position="top"
        data-x-position="center"
        data-index="0"
        data-front="true"
        data-swiping="false"
        data-dismissible="true"
        data-type={toast.type ?? "info"}
        data-swipe-out="false"
        data-expanded="false"
        style={
          {
            "--index": "0",
            "--toasts-before": "0",
            "--z-index": "1",
            "--offset": "0px",
            "--initial-height": "53.5px",
            top: "50px",
            color,
            fontSize,
          } as React.CSSProperties
        }
      >
        <div data-icon="">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            height="20"
            width="20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
              clipRule="evenodd"
            ></path>
          </svg>
        </div>
        <div data-content="">
          <div data-title="">{toast.message}</div>
        </div>
      </li>
    </ol>
  );
}
