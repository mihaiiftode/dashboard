"use client"

import * as React from "react"

export type TransitionProps = {
  enter?: string
  exit?: string
  default?: string
  children: React.ReactNode
}

const Passthrough = ({ children }: TransitionProps) => children

const provided = (React as { ViewTransition?: React.ComponentType<TransitionProps> }).ViewTransition

export const Transition: React.ComponentType<TransitionProps> = provided ?? Passthrough
