import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";

type StudentAvatarProps = {
  photoUrl?: string | null;
  className?: string;
};

export default function StudentAvatar({ photoUrl, className = "" }: StudentAvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [photoUrl]);

  return (
    <span
      aria-hidden="true"
      className={`inline-grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-[#DCE9E0] bg-[#E8F3EC] text-[#17663B] ${className}`}
    >
      {photoUrl && !failed ? (
        <img
          src={photoUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <UserRound className="size-1/2" />
      )}
    </span>
  );
}
