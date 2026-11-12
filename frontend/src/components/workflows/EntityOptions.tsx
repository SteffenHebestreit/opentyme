/**
 * <option> lists of the user's own records, for the selects of the workflow
 * UI (a node's fixed client, the subject of a run, a mail's template). Each is
 * its own component so a select only loads the list it shows.
 */
import { FC } from 'react';
import { useClients } from '../../hooks/api/useClients';
import { useProjects } from '../../hooks/api/useProjects';
import { useInvoices } from '../../hooks/api/useInvoices';
import { useEmailTemplates } from '../../api/hooks/useEmailTemplates';

export const ClientOptions: FC = () => {
  const { data } = useClients();
  return (
    <>
      {(data ?? []).map((client) => (
        <option key={client.id} value={client.id}>
          {client.name}
        </option>
      ))}
    </>
  );
};

export const ProjectOptions: FC = () => {
  const { data } = useProjects();
  return (
    <>
      {(data ?? []).map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </>
  );
};

export const InvoiceOptions: FC = () => {
  const { data } = useInvoices();
  return (
    <>
      {(data ?? []).map((invoice) => (
        <option key={invoice.id} value={invoice.id}>
          {[invoice.invoice_number, invoice.client_name].filter(Boolean).join(' · ')}
        </option>
      ))}
    </>
  );
};

export const EmailTemplateOptions: FC = () => {
  const { data } = useEmailTemplates();
  return (
    <>
      {(data ?? []).map((template) => (
        <option key={template.id} value={template.id}>
          {template.name}
        </option>
      ))}
    </>
  );
};
