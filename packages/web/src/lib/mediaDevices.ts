export type MediaDeviceOption = { deviceId: string; label: string };

export async function listCameras(): Promise<MediaDeviceOption[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((d) => d.kind === 'videoinput' && d.deviceId)
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `Камера ${d.deviceId.slice(0, 8)}…`,
    }));
}

export async function listMicrophones(): Promise<MediaDeviceOption[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((d) => d.kind === 'audioinput' && d.deviceId)
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `Микрофон ${d.deviceId.slice(0, 8)}…`,
    }));
}

export function pickExistingDeviceId(
  preferredId: string,
  devices: MediaDeviceOption[]
): string {
  if (preferredId && devices.some((d) => d.deviceId === preferredId)) {
    return preferredId;
  }
  return devices[0]?.deviceId ?? '';
}
