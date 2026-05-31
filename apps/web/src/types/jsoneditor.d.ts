declare module 'jsoneditor' {
  export type JSONEditorMode = 'tree' | 'view' | 'form' | 'code' | 'text' | 'preview';

  export type JSONEditorOptions = {
    mode?: JSONEditorMode;
    modes?: JSONEditorMode[];
    name?: string;
    mainMenuBar?: boolean;
    navigationBar?: boolean;
    statusBar?: boolean;
    search?: boolean;
    history?: boolean;
    indentation?: number;
    editable?:
      | boolean
      | ((node: {
          field?: string;
          value?: unknown;
          path?: Array<string | number>;
        }) => boolean | { field?: boolean; value?: boolean });
    onChangeText?: (jsonString: string) => void;
    onError?: (error: Error) => void;
  };

  export default class JSONEditor {
    constructor(container: HTMLElement, options?: JSONEditorOptions);
    destroy(): void;
    getText(): string;
    set(json: unknown): void;
    setText(jsonString: string): void;
    setMode(mode: JSONEditorMode): void;
    refresh(): void;
  }
}
