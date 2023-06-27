export interface uploadActivity {
  totalBytes: number,
  transferedBytes: number,
  completed: boolean,
  failed: boolean,
  error?: string,
  fileName: string
}