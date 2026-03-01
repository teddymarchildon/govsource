import Link from 'next/link';
import { Congressman } from '../types/types';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Globe } from 'lucide-react';

interface CongressmanCardProps {
  congressman: Congressman;
}

export default function CongressmanCard({ congressman }: CongressmanCardProps) {
  // Helper function to get party tag class
  const getPartyBadgeClass = (party: string) => {
    switch (party.toLowerCase()) {
      case 'democrat':
        return 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/90';
      case 'republican':
        return 'border-transparent bg-red-100 text-red-800 hover:bg-red-200';
      default:
        return 'border-transparent bg-muted text-muted-foreground hover:bg-muted/90';
    }
  };

  // Format chamber and district info
  const getChamberInfo = () => {
    if (!congressman.chamber) return '';

    const isHouse = congressman.chamber.toLowerCase() === 'house';
    const isSenate = congressman.chamber.toLowerCase() === 'senate';

    if (isHouse) {
      return `U.S. Representative${congressman.district ? `, ${congressman.state}-${congressman.district}` : ''}`;
    } else if (isSenate) {
      return `U.S. Senator, ${congressman.state}`;
    }

    return congressman.chamber;
  };

  return (
    <Card className="group flex h-full flex-col border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg">
            <Link href={`/congressmen/${congressman.id}`} className="transition-colors group-hover:text-primary">
              {congressman.full_name}
            </Link>
          </CardTitle>

          <Badge className={getPartyBadgeClass(congressman.party)}>
            {congressman.party}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 flex-grow flex flex-col">
        {congressman.chamber && (
          <p className="mb-4 text-sm text-muted-foreground">
            {getChamberInfo()}
          </p>
        )}

        <div className="space-y-2 mt-auto">
          {congressman.phone && (
            <div className="flex items-center text-sm text-muted-foreground">
              <Phone className="mr-2 h-4 w-4 text-muted-foreground/80" />
              {congressman.phone}
            </div>
          )}

          {congressman.website && (
            <div className="flex items-center text-sm">
              <Globe className="mr-2 h-4 w-4 text-muted-foreground/80" />
              <a
                href={congressman.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Official Website
              </a>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
