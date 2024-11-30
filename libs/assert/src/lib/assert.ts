export function assert(condition: boolean, message: string, context: Record<string, unknown>) {
  if(!condition) {
    console.log('assert context:', context);

    throw new Error(message)
  }
}
