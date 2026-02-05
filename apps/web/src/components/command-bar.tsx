import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Play, Square, Cpu, MoreHorizontal } from "lucide-react";

export function CommandBar({ selectedPid }: { selectedPid: number | null }) {
  return (
    <div className="flex items-center gap-1 p-1 bg-[#202020] border-b border-zinc-800">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-2 text-zinc-300 hover:text-white hover:bg-zinc-800 font-normal"
      >
        <Play className="h-4 w-4 text-green-500" />
        Run new task
      </Button>

      <div className="w-[1px] h-5 bg-zinc-700 mx-1" />

      <Button
        variant="ghost"
        size="sm"
        disabled={!selectedPid}
        className={cn(
          "h-8 gap-2 font-normal",
          selectedPid
            ? "text-zinc-300 hover:text-white hover:bg-zinc-800"
            : "text-zinc-600",
        )}
      >
        <Square
          className={cn(
            "h-4 w-4",
            selectedPid ? "text-red-400 fill-red-400" : "",
          )}
        />
        End task
      </Button>

      <Button
        variant="ghost"
        size="sm"
        disabled={!selectedPid}
        className={cn(
          "h-8 gap-2 font-normal",
          selectedPid
            ? "text-zinc-300 hover:text-white hover:bg-zinc-800"
            : "text-zinc-600",
        )}
      >
        <Cpu className="h-4 w-4" />
        Efficiency mode
      </Button>

      <div className="flex-1" />

      <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}
