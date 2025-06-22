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
        return 'bg-secondary text-secondary-foreground border-transparent hover:bg-secondary/80';
      case 'republican':
        return 'bg-red-100 text-red-800 border-transparent hover:bg-red-200';
      default:
        return 'bg-gray-200 text-gray-800 border-transparent hover:bg-gray-300';
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
    <Card className="h-full flex flex-col hover:shadow-md transition-shadow duration-200">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg">
            <Link href={`/congressmen/${congressman.id}`} className="hover:text-blue-600 transition-colors">
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
          <p className="text-sm text-gray-600 mb-4">
            {getChamberInfo()}
          </p>
        )}

        <div className="space-y-2 mt-auto">
          {congressman.phone && (
            <div className="flex items-center text-sm text-gray-600">
              <Phone className="h-4 w-4 mr-2 text-gray-400" />
              {congressman.phone}
            </div>
          )}

          {congressman.website && (
            <div className="flex items-center text-sm">
              <Globe className="h-4 w-4 mr-2 text-gray-400" />
              <a
                href={congressman.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
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
