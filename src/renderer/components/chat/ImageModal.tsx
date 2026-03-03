import React, { useState, useEffect, useCallback, useRef } from "react";

interface ImageModalProps {
  src: string;
  localFilePath?: string;
  onClose: () => void;
}

interface MenuPosition {
  x: number;
  y: number;
}

export function ImageModal({ src, localFilePath, onClose }: ImageModalProps) {
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (menu) {
          closeMenu();
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, menu, closeMenu]);

  useEffect(() => {
    if (!menu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [menu, closeMenu]);

  function handleContextMenu(e: React.MouseEvent) {
    if (!localFilePath) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  async function handleCopy() {
    if (!localFilePath) return;
    try {
      await window.dchat.image.copy(localFilePath);
    } catch (err) {
      console.error("Failed to copy image:", err);
    }
    closeMenu();
  }

  async function handleSave() {
    if (!localFilePath) return;
    try {
      await window.dchat.image.save(localFilePath);
    } catch (err) {
      console.error("Failed to save image:", err);
    }
    closeMenu();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <img
        src={src}
        alt="Full size"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={handleContextMenu}
      />
      {menu && localFilePath && (
        <div
          ref={menuRef}
          className="fixed z-[60] bg-surface-deepest border border-border-subtle rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            onClick={handleCopy}
            className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover transition-colors"
          >
            Copy Image
          </button>
          <button
            onClick={handleSave}
            className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover transition-colors"
          >
            Save Image As...
          </button>
        </div>
      )}
    </div>
  );
}
