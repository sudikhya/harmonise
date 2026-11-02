"use client";

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";

export type NameMode = "alias" | "real";
export type ConnectTab = "find" | "journey" | "circles" | "coaches";

export type Contribution = { id: string; circleId: string; text: string; time: string };

export type Account = { id: number; name: string; email: string };

type SessionState = {
  entered: boolean;
  /** True until the member shell has checked /api/auth/me for a cookie session. */
  hydrating: boolean;
  /** Set for database-backed logins; null for local alias/demo entry. */
  account: Account | null;
  displayName: string;
  nameMode: NameMode;
  email: string;
  demo: boolean;
  points: number;
  joined: string[];
  contributions: Contribution[];
  confirmedMilestones: string[];
  tab: ConnectTab;
  urgentOpen: boolean;
  coachPreviewOpen: boolean;
};

const initialState: SessionState = {
  entered: false,
  hydrating: true,
  account: null,
  displayName: "",
  nameMode: "alias",
  email: "",
  demo: false,
  points: 0,
  joined: [],
  contributions: [],
  confirmedMilestones: [],
  tab: "find",
  urgentOpen: false,
  coachPreviewOpen: false,
};

type Action =
  | { type: "enter"; displayName: string; nameMode: NameMode; email: string; demo: boolean }
  | { type: "login"; account: Account }
  | { type: "auth-checked" }
  | { type: "exit" }
  | { type: "set-tab"; tab: ConnectTab }
  | { type: "join"; id: string }
  | { type: "contribute"; contribution: Contribution }
  | { type: "points"; amount: number }
  | { type: "confirm-milestone"; id: string }
  | { type: "urgent"; open: boolean }
  | { type: "coach-preview"; open: boolean };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "enter":
      return { ...initialState, entered: true, hydrating: false, displayName: action.displayName, nameMode: action.nameMode, email: action.email, demo: action.demo };
    case "login":
      return {
        ...initialState,
        entered: true,
        hydrating: false,
        account: action.account,
        displayName: action.account.name,
        nameMode: "real",
        email: action.account.email,
        demo: false,
      };
    case "auth-checked":
      return { ...state, hydrating: false };
    case "exit":
      return { ...initialState, hydrating: false };
    case "set-tab":
      return { ...state, tab: action.tab };
    case "join":
      return state.joined.includes(action.id) ? state : { ...state, joined: [...state.joined, action.id] };
    case "contribute":
      return { ...state, contributions: [action.contribution, ...state.contributions], points: state.points + 5 };
    case "points":
      return { ...state, points: state.points + action.amount };
    case "confirm-milestone":
      return state.confirmedMilestones.includes(action.id)
        ? state
        : { ...state, confirmedMilestones: [...state.confirmedMilestones, action.id], points: state.points + 2 };
    case "urgent":
      return { ...state, urgentOpen: action.open };
    case "coach-preview":
      return { ...state, coachPreviewOpen: action.open };
    default:
      return state;
  }
}

const SessionContext = createContext<{ state: SessionState; dispatch: React.Dispatch<Action> } | null>(null);

export function ConnectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside ConnectProvider");
  return context;
}
