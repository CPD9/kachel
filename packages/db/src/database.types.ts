export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      assumptions: {
        Row: {
          key: string;
          section: string;
          source: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          section: string;
          source: string;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          section?: string;
          source?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      buyers: {
        Row: {
          buys: string;
          created_at: string;
          id: string;
          name: string;
          synthetic: boolean;
        };
        ComputedFields: never;
        Insert: {
          buys: string;
          created_at?: string;
          id: string;
          name: string;
          synthetic?: boolean;
        };
        Update: {
          buys?: string;
          created_at?: string;
          id?: string;
          name?: string;
          synthetic?: boolean;
        };
        Relationships: [];
      };
      decisions: {
        Row: {
          batch: number;
          demand_kwh: number;
          entry: string;
          hash: string;
          interactive: number;
          opportunistic: number;
          placed: number;
          prev_hash: string;
          reason: string;
          run: NonNullable<Json>;
          seq: number;
          site_id: string;
          soc_kwh: number;
          tank_kwh: number;
          temp_c: number | null;
          time: string;
          written_at: string;
        };
        ComputedFields: never;
        Insert: {
          batch: number;
          demand_kwh: number;
          entry: string;
          hash: string;
          interactive: number;
          opportunistic: number;
          placed?: number;
          prev_hash: string;
          reason: string;
          run: NonNullable<Json>;
          seq: number;
          site_id: string;
          soc_kwh: number;
          tank_kwh: number;
          temp_c?: number | null;
          time: string;
          written_at?: string;
        };
        Update: {
          batch?: number;
          demand_kwh?: number;
          entry?: string;
          hash?: string;
          interactive?: number;
          opportunistic?: number;
          placed?: number;
          prev_hash?: string;
          reason?: string;
          run?: NonNullable<Json>;
          seq?: number;
          site_id?: string;
          soc_kwh?: number;
          tank_kwh?: number;
          temp_c?: number | null;
          time?: string;
          written_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "decisions_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      heat_state: {
        Row: {
          arr_batch: number;
          arr_interactive: number;
          backup_kwh: number;
          batch: number;
          demand_kwh: number;
          dumped_kwh: number;
          heat_produced: number;
          heat_used: number;
          interactive: number;
          missed: number;
          moved: number;
          opportunistic: number;
          reason: string | null;
          reserve_kwh: number;
          served_kwh: number;
          server_hours: number;
          site_id: string;
          soc_kwh: number;
          temp_c: number | null;
          time: string;
        };
        ComputedFields: never;
        Insert: {
          arr_batch?: number;
          arr_interactive?: number;
          backup_kwh?: number;
          batch?: number;
          demand_kwh: number;
          dumped_kwh?: number;
          heat_produced?: number;
          heat_used?: number;
          interactive?: number;
          missed?: number;
          moved?: number;
          opportunistic?: number;
          reason?: string | null;
          reserve_kwh?: number;
          served_kwh?: number;
          server_hours?: number;
          site_id: string;
          soc_kwh?: number;
          temp_c?: number | null;
          time: string;
        };
        Update: {
          arr_batch?: number;
          arr_interactive?: number;
          backup_kwh?: number;
          batch?: number;
          demand_kwh?: number;
          dumped_kwh?: number;
          heat_produced?: number;
          heat_used?: number;
          interactive?: number;
          missed?: number;
          moved?: number;
          opportunistic?: number;
          reason?: string | null;
          reserve_kwh?: number;
          served_kwh?: number;
          server_hours?: number;
          site_id?: string;
          soc_kwh?: number;
          temp_c?: number | null;
          time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "heat_state_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      job_runs: {
        Row: {
          at: string;
          id: number;
          items_done: number | null;
          job_id: string;
          reason: string | null;
          run: boolean;
          server_id: string | null;
          state: Database["public"]["Enums"]["job_state"];
          tick: number;
        };
        ComputedFields: never;
        Insert: {
          at?: string;
          id?: never;
          items_done?: number | null;
          job_id: string;
          reason?: string | null;
          run: boolean;
          server_id?: string | null;
          state: Database["public"]["Enums"]["job_state"];
          tick: number;
        };
        Update: {
          at?: string;
          id?: never;
          items_done?: number | null;
          job_id?: string;
          reason?: string | null;
          run?: boolean;
          server_id?: string | null;
          state?: Database["public"]["Enums"]["job_state"];
          tick?: number;
        };
        Relationships: [
          {
            foreignKeyName: "job_runs_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_runs_server_id_fkey";
            columns: ["server_id"];
            isOneToOne: false;
            referencedRelation: "servers";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          active_cpu_s: number;
          buyer_id: string;
          created_at: string;
          deadline_at: string | null;
          id: string;
          interruptible: boolean;
          items_done: number;
          items_total: number | null;
          kind: Database["public"]["Enums"]["job_kind"];
          label: string;
          moved_offsite: boolean;
          pid: number | null;
          privacy: string;
          server_hours: number | null;
          server_id: string | null;
          site_id: string | null;
          state: Database["public"]["Enums"]["job_state"];
          updated_at: string;
          workload: string | null;
        };
        ComputedFields: never;
        Insert: {
          active_cpu_s?: number;
          buyer_id: string;
          created_at?: string;
          deadline_at?: string | null;
          id?: string;
          interruptible: boolean;
          items_done?: number;
          items_total?: number | null;
          kind: Database["public"]["Enums"]["job_kind"];
          label: string;
          moved_offsite?: boolean;
          pid?: number | null;
          privacy?: string;
          server_hours?: number | null;
          server_id?: string | null;
          site_id?: string | null;
          state?: Database["public"]["Enums"]["job_state"];
          updated_at?: string;
          workload?: string | null;
        };
        Update: {
          active_cpu_s?: number;
          buyer_id?: string;
          created_at?: string;
          deadline_at?: string | null;
          id?: string;
          interruptible?: boolean;
          items_done?: number;
          items_total?: number | null;
          kind?: Database["public"]["Enums"]["job_kind"];
          label?: string;
          moved_offsite?: boolean;
          pid?: number | null;
          privacy?: string;
          server_hours?: number | null;
          server_id?: string | null;
          site_id?: string | null;
          state?: Database["public"]["Enums"]["job_state"];
          updated_at?: string;
          workload?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_server_id_fkey";
            columns: ["server_id"];
            isOneToOne: false;
            referencedRelation: "servers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      kpis: {
        Row: {
          backup_heat_kwh: number;
          break_even_chf_per_server_hour: number | null;
          computed_at: string;
          computing_income_chf: number;
          does_not_pay_off_when: string | null;
          electricity_cost_chf: number;
          heat_demand_kwh: number;
          heat_dumped_kwh: number;
          heating_days: number | null;
          id: number;
          missed_deadlines_pct_of_jobs: number;
          moved_offsite_pct_of_deadline_jobs: number;
          pays_off_at_assumed_compute_price: boolean;
          profile_source: string;
          server_hours_sold: number;
          servers_per_house: number;
          share_of_heat_covered_pct: number;
          site_id: string;
          utilisation_pct: number;
          value_of_heat_used_chf: number;
        };
        ComputedFields: never;
        Insert: {
          backup_heat_kwh: number;
          break_even_chf_per_server_hour?: number | null;
          computed_at?: string;
          computing_income_chf: number;
          does_not_pay_off_when?: string | null;
          electricity_cost_chf: number;
          heat_demand_kwh: number;
          heat_dumped_kwh: number;
          heating_days?: number | null;
          id?: never;
          missed_deadlines_pct_of_jobs: number;
          moved_offsite_pct_of_deadline_jobs: number;
          pays_off_at_assumed_compute_price: boolean;
          profile_source: string;
          server_hours_sold: number;
          servers_per_house: number;
          share_of_heat_covered_pct: number;
          site_id: string;
          utilisation_pct: number;
          value_of_heat_used_chf: number;
        };
        Update: {
          backup_heat_kwh?: number;
          break_even_chf_per_server_hour?: number | null;
          computed_at?: string;
          computing_income_chf?: number;
          does_not_pay_off_when?: string | null;
          electricity_cost_chf?: number;
          heat_demand_kwh?: number;
          heat_dumped_kwh?: number;
          heating_days?: number | null;
          id?: never;
          missed_deadlines_pct_of_jobs?: number;
          moved_offsite_pct_of_deadline_jobs?: number;
          pays_off_at_assumed_compute_price?: boolean;
          profile_source?: string;
          server_hours_sold?: number;
          servers_per_house?: number;
          share_of_heat_covered_pct?: number;
          site_id?: string;
          utilisation_pct?: number;
          value_of_heat_used_chf?: number;
        };
        Relationships: [
          {
            foreignKeyName: "kpis_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      measurements: {
        Row: {
          active_cpu_s: number;
          device_watts_assumed: number;
          energy_per_job_wh: number;
          id: number;
          items_measured: number;
          items_per_job: number;
          items_per_s_on_this_device: number;
          jobs_per_reference_server_hour: number;
          measured_at: string;
          runtime_per_job_s_on_reference_server: number;
          runtime_per_job_s_on_this_device: number;
          scaling_rule: string;
          server_id: string | null;
          workload: string;
        };
        ComputedFields: never;
        Insert: {
          active_cpu_s: number;
          device_watts_assumed: number;
          energy_per_job_wh: number;
          id?: never;
          items_measured: number;
          items_per_job: number;
          items_per_s_on_this_device: number;
          jobs_per_reference_server_hour: number;
          measured_at?: string;
          runtime_per_job_s_on_reference_server: number;
          runtime_per_job_s_on_this_device: number;
          scaling_rule: string;
          server_id?: string | null;
          workload: string;
        };
        Update: {
          active_cpu_s?: number;
          device_watts_assumed?: number;
          energy_per_job_wh?: number;
          id?: never;
          items_measured?: number;
          items_per_job?: number;
          items_per_s_on_this_device?: number;
          jobs_per_reference_server_hour?: number;
          measured_at?: string;
          runtime_per_job_s_on_reference_server?: number;
          runtime_per_job_s_on_this_device?: number;
          scaling_rule?: string;
          server_id?: string | null;
          workload?: string;
        };
        Relationships: [
          {
            foreignKeyName: "measurements_server_id_fkey";
            columns: ["server_id"];
            isOneToOne: false;
            referencedRelation: "servers";
            referencedColumns: ["id"];
          },
        ];
      };
      servers: {
        Row: {
          heat_recovery: number;
          id: string;
          idle_power_kw: number;
          name: string;
          power_kw: number;
          site_id: string;
          slot: number;
          state: Database["public"]["Enums"]["server_state"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          heat_recovery: number;
          id?: string;
          idle_power_kw?: number;
          name: string;
          power_kw: number;
          site_id: string;
          slot: number;
          state?: Database["public"]["Enums"]["server_state"];
          updated_at?: string;
        };
        Update: {
          heat_recovery?: number;
          id?: string;
          idle_power_kw?: number;
          name?: string;
          power_kw?: number;
          site_id?: string;
          slot?: number;
          state?: Database["public"]["Enums"]["server_state"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "servers_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      sites: {
        Row: {
          city: string;
          created_at: string;
          host_id: string;
          hot_water_kwh_per_day: number;
          hot_water_shape: string;
          id: string;
          latitude: number | null;
          longitude: number | null;
          name: string;
          tank_kwh: number;
        };
        ComputedFields: never;
        Insert: {
          city: string;
          created_at?: string;
          host_id: string;
          hot_water_kwh_per_day: number;
          hot_water_shape?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          tank_kwh: number;
        };
        Update: {
          city?: string;
          created_at?: string;
          host_id?: string;
          hot_water_kwh_per_day?: number;
          hot_water_shape?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          tank_kwh?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      job_kind: "interactive" | "batch" | "opportunistic";
      job_state: "QUEUED" | "RUNNING" | "PAUSED" | "GONE";
      server_state: "RUNNING" | "PAUSED" | "OFF";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      job_kind: ["interactive", "batch", "opportunistic"],
      job_state: ["QUEUED", "RUNNING", "PAUSED", "GONE"],
      server_state: ["RUNNING", "PAUSED", "OFF"],
    },
  },
} as const;
