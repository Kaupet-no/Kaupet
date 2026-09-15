const VEHICLE_REGISTRATION_NUMBER = /^(?=.{2,8}$)[A-ZÆØÅ0-9]+(?: [A-ZÆØÅ0-9]+)?$/iu;

export function isValidVehicleRegistrationNumber(value: string): boolean {
  return VEHICLE_REGISTRATION_NUMBER.test(value.trim());
}
