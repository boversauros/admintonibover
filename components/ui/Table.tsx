import { ReactNode } from 'react';
import { Button } from './Button';

export interface TableColumn<T> {
  key: keyof T;
  label: string;
  render?: (value: T[keyof T], row: T, index: number) => ReactNode;
  className?: string;
  width?: string;
}

export interface TableAction<T> {
  label: string;
  icon?: ReactNode;
  onClick: (row: T, index: number) => void;
  variant?: 'ghost' | 'icon';
  size?: 'sm' | 'md';
  className?: string;
}

interface TableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  actions?: TableAction<T>[];
  rowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
  emptyMessage?: string;
  striped?: boolean;
  hoverable?: boolean;
  className?: string;
}

export function Table<T>({
  data,
  columns,
  actions,
  rowKey = (_, index) => index.toString(),
  onRowClick,
  emptyMessage = 'No data available',
  striped = false,
  hoverable = false,
  className = '',
}: TableProps<T>) {
  const hasActions = actions && actions.length > 0;

  if (data.length === 0) {
    return (
      <div className="w-full p-8 text-center text-muted border border-subtle bg-surface">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`w-full overflow-x-auto ${className}`.trim()}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-surface">
            {columns.map((column) => (
              <th
                key={String(column.key)}
                className={`
                  text-left
                  text-sm
                  text-primary
                  font-medium
                  tracking-wide
                  px-4
                  py-3
                  border-b
                  border-default
                  ${column.width || ''}
                  ${column.className || ''}
                `.trim().replace(/\s+/g, ' ')}
              >
                {column.label}
              </th>
            ))}
            {hasActions && (
              <th className="text-right text-sm text-primary font-medium tracking-wide px-4 py-3 border-b border-default">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowKey(row, rowIndex)}
              className={`
                border-b
                border-subtle
                ${striped && rowIndex % 2 === 1 ? 'bg-surface/50' : ''}
                ${hoverable ? 'hover:bg-surface transition-colors-default' : ''}
                ${onRowClick ? 'cursor-pointer' : ''}
              `.trim().replace(/\s+/g, ' ')}
              onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
            >
              {columns.map((column) => {
                const value = row[column.key];
                return (
                  <td
                    key={String(column.key)}
                    className={`
                      text-sm
                      text-body
                      px-4
                      py-3
                      ${column.className || ''}
                    `.trim().replace(/\s+/g, ' ')}
                  >
                    {column.render
                      ? column.render(value, row, rowIndex)
                      : String(value)}
                  </td>
                );
              })}
              {hasActions && (
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {actions.map((action, actionIndex) => (
                      <Button
                        key={actionIndex}
                        variant={action.variant || 'ghost'}
                        size={action.size || 'sm'}
                        onClick={(e) => {
                          e.stopPropagation();
                          action.onClick(row, rowIndex);
                        }}
                        className={action.className || ''}
                      >
                        {action.icon}
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
