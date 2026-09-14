import type { ReactNode } from "react";
import { Ellipsis, UserRound } from "lucide-react";
import type { PublicUser } from "../../shared/types";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type Props = {
  /** Signed-in account shown at the top so the user can tell which one this is. */
  user?: PublicUser | null;
  children: ReactNode;
};

export function AppMenu({ user, children }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-lg" type="button" aria-label="メニュー">
          <Ellipsis aria-hidden="true" className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        aria-label="メニュー"
        onKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          // Opening a dialog from an item must not return focus to the menu trigger.
          if (document.querySelector('[role="dialog"]')) event.preventDefault();
        }}
      >
        {user ? (
          <>
            <DropdownMenuLabel className="flex max-w-80 items-center gap-3 py-3">
              {user.image ? (
                <img src={user.image} alt="" className="size-8 shrink-0 rounded-full" />
              ) : (
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft font-brand text-sm font-semibold text-accent"
                  aria-hidden="true"
                >
                  <UserRound className="size-4" />
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{user.name}</div>
                <div className="truncate text-xs text-muted">{user.email}</div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
