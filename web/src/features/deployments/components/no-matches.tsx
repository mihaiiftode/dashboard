import { SearchXIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export const NoMatches = ({ onClearQuery }: { onClearQuery: () => void }) => (
  <Empty className="flex-1" data-slot="no-matches">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <SearchXIcon />
      </EmptyMedia>
      <EmptyTitle>No deployments match</EmptyTitle>
      <EmptyDescription>Loosen a token or clear the query.</EmptyDescription>
    </EmptyHeader>
    <Button variant="outline" size="sm" onClick={onClearQuery}>
      Clear query
    </Button>
  </Empty>
)
