export interface DialogButton {
  id: string;
  label: string;
  primary?: boolean;
  /** Pressing Escape picks this button. */
  cancel?: boolean;
  danger?: boolean;
}

export type DialogRequest =
  | { kind: 'confirm'; title: string; message: string; buttons: DialogButton[]; resolve(id: string): void }
  | {
      kind: 'prompt';
      title: string;
      label: string;
      value: string;
      okLabel: string;
      cancelLabel: string;
      resolve(value: string | null): void;
    };

/** Modal dialogs drawn by the app (consistent with the theme, unlike native dialogs). One at a time. */
export class Dialogs {
  current = $state<DialogRequest | null>(null);
  private queue: (() => void)[] = [];

  private show<T>(make: (resolve: (value: T) => void) => DialogRequest): Promise<T> {
    return new Promise<T>((resolve) => {
      const open = () => {
        this.current = make((value) => {
          this.current = null;
          resolve(value);
          this.queue.shift()?.();
        });
      };
      if (this.current) this.queue.push(open);
      else open();
    });
  }

  confirm(title: string, message: string, buttons: DialogButton[]): Promise<string> {
    return this.show<string>((resolve) => ({ kind: 'confirm', title, message, buttons, resolve }));
  }

  alert(title: string, message: string, okLabel: string): Promise<void> {
    return this.confirm(title, message, [{ id: 'ok', label: okLabel, primary: true, cancel: true }]).then(
      () => {},
    );
  }

  prompt(
    title: string,
    label: string,
    value: string,
    okLabel: string,
    cancelLabel: string,
  ): Promise<string | null> {
    return this.show<string | null>((resolve) => ({
      kind: 'prompt',
      title,
      label,
      value,
      okLabel,
      cancelLabel,
      resolve,
    }));
  }
}
