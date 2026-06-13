declare abstract class WorkflowEntrypoint<Env, Params> {
  protected readonly env: Env;
  abstract run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
}

interface WorkflowEvent<Params> {
  readonly payload: Params;
}

interface WorkflowStep {
  do<T>(name: string, callback: () => Promise<T> | T): Promise<T>;
}
