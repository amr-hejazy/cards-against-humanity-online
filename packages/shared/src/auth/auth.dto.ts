export type UserDTO = {
  id: string;
  username: string;
  email?: string;
};

export type UserResponseDTO = {
  user: UserDTO;
  token: string;
};

export type GuestResponseDTO = {
  user: UserDTO;
  token: string;
};