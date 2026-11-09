/* Praise Kier */
import { useId, useState } from "react";
import { validateImage } from "./imageProcessor";
import { errorMessage } from "../cp45/http";
export function ImagePicker({
  onFiles,
  multiple = false,
  disabled = false,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [error, setError] = useState("");
  function select(files: File[]) {
    if (disabled || files.length === 0) return;
    try {
      files.forEach(validateImage);
      onFiles(multiple ? files : files.slice(0, 1));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div
      className="my-4 rounded border-2 border-dashed border-slate-400 p-6"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        select(Array.from(event.dataTransfer.files));
      }}
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files);
        if (files.length) {
          event.preventDefault();
          select(files);
        }
      }}
    >
      <label htmlFor={id} className="block font-semibold">
        {multiple ? "Seleccionar fotografías" : "Seleccionar imagen"}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          select(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <p id={`${id}-help`}>
        JPEG, PNG o WebP · hasta 20 MB. También puedes arrastrar una imagen aquí
        o pegarla con el foco dentro de esta zona.
      </p>
      <input
        aria-label="Zona para pegar imágenes del portapapeles"
        aria-describedby={`${id}-help`}
        readOnly
        value=""
        placeholder="Enfoca aquí y pega una imagen"
        disabled={disabled}
      />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
