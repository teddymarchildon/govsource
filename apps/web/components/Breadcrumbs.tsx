"use client";

import Link from "next/link";
import React from "react";

export interface BreadcrumbStep {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  steps: BreadcrumbStep[];
  className?: string;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ steps, className = "" }) => {
  return (
    <nav className={`mb-6 text-sm ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        {steps.map((step, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <li className="text-gray-500">/</li>}
            <li className={idx === steps.length - 1 ? "text-gray-700 truncate max-w-xs" : undefined}>
              {step.href && idx !== steps.length - 1 ? (
                <Link href={step.href} className="text-primary hover:underline">
                  {step.label}
                </Link>
              ) : (
                <span>{step.label}</span>
              )}
            </li>
          </React.Fragment>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
