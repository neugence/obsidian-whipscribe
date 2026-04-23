import { Notice } from "obsidian";

export class StatusBar {
  constructor(private el: HTMLElement) {
    el.addClass("whipscribe-statusbar");
  }

  set(text: string, recording = false): void {
    this.el.setText(text);
    this.el.toggleClass("is-recording", recording);
  }

  clear(): void {
    this.el.setText("");
    this.el.removeClass("is-recording");
  }
}

export interface ProgressHandle {
  update(text: string): void;
  done(): void;
}

export function progressNotice(initial: string): ProgressHandle {
  const notice = new Notice(initial, 0);
  return {
    update: (text: string) => {
      notice.setMessage(text);
    },
    done: () => {
      notice.hide();
    },
  };
}
