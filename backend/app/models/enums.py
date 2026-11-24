from enum import StrEnum


class UserRole(StrEnum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    SCOREKEEPER = "scorekeeper"


class CourtSurface(StrEnum):
    INDOOR = "Indoor"
    OUTDOOR = "Outdoor"


class CourtStatus(StrEnum):
    AVAILABLE = "Available"
    RESERVED = "Reserved"
    OCCUPIED = "Occupied"
    MAINTENANCE = "Maintenance"
    DISABLED = "Disabled"


class MatchType(StrEnum):
    SINGLES = "Singles"
    DOUBLES = "Doubles"


class GameStatus(StrEnum):
    UPCOMING = "Upcoming"
    LIVE = "Live"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class ScoringType(StrEnum):
    SIDE_OUT = "Side-Out"
    RALLY = "Rally"


class MatchFormat(StrEnum):
    SINGLE_GAME = "Single Game"
    BEST_OF_3 = "Best of 3"
    BEST_OF_5 = "Best of 5"


class TournamentFormat(StrEnum):
    SINGLE_ELIMINATION = "Single Elimination"
    DOUBLE_ELIMINATION = "Double Elimination"
    ROUND_ROBIN = "Round Robin"


class TournamentStatus(StrEnum):
    DRAFT = "Draft"
    REGISTRATION_OPEN = "Registration Open"
    REGISTRATION_CLOSED = "Registration Closed"
    ONGOING = "Ongoing"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"
