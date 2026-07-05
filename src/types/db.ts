export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      contract_requests: {
        Row: {
          contact_email: string
          contact_name: string
          created_at: string
          id: string
          message: string | null
          org_name: string
        }
        Insert: {
          contact_email: string
          contact_name: string
          created_at?: string
          id?: string
          message?: string | null
          org_name: string
        }
        Update: {
          contact_email?: string
          contact_name?: string
          created_at?: string
          id?: string
          message?: string | null
          org_name?: string
        }
        Relationships: []
      }
      dish_ratings: {
        Row: {
          category: string
          dish_key: string
          dish_name: string
          org_id: string
          rating: number
          student_id: string
          updated_at: string
        }
        Insert: {
          category: string
          dish_key: string
          dish_name: string
          org_id: string
          rating: number
          student_id?: string
          updated_at?: string
        }
        Update: {
          category?: string
          dish_key?: string
          dish_name?: string
          org_id?: string
          rating?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dish_ratings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dish_ratings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dish_ratings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_cycle_days: {
        Row: {
          breakfast: Json
          cycle_id: string
          day_number: number
          dinner: Json
          id: string
          lunch: Json
          notes: string | null
          org_id: string
          updated_at: string
          weekday: string | null
        }
        Insert: {
          breakfast?: Json
          cycle_id: string
          day_number: number
          dinner?: Json
          id?: string
          lunch?: Json
          notes?: string | null
          org_id: string
          updated_at?: string
          weekday?: string | null
        }
        Update: {
          breakfast?: Json
          cycle_id?: string
          day_number?: number
          dinner?: Json
          id?: string
          lunch?: Json
          notes?: string | null
          org_id?: string
          updated_at?: string
          weekday?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_cycle_days_cycle_id_fk"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "menu_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_cycle_days_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "menu_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_cycle_days_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_cycles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          org_id: string
          starts_on: string | null
          title: string
          updated_at: string
          version_label: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          starts_on?: string | null
          title: string
          updated_at?: string
          version_label?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          starts_on?: string | null
          title?: string
          updated_at?: string
          version_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_cycles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_cycles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_cycles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          id: string
          item_name: string
          org_id: string
          status: string
          store_item_id: string | null
          student_id: string
          token_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          org_id: string
          status?: string
          store_item_id?: string | null
          student_id: string
          token_cost: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          org_id?: string
          status?: string
          store_item_id?: string | null
          student_id?: string
          token_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_item_id_fk"
            columns: ["store_item_id"]
            isOneToOne: false
            referencedRelation: "store_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_item_id_fkey"
            columns: ["store_item_id"]
            isOneToOne: false
            referencedRelation: "store_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          auth_provider: string
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          auth_provider?: string
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          auth_provider?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_staff: boolean
          last_survey_date: string | null
          mjcc_username: string | null
          org_id: string
          points: number
          role: string
          streak: number
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_staff?: boolean
          last_survey_date?: string | null
          mjcc_username?: string | null
          org_id: string
          points?: number
          role?: string
          streak?: number
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_staff?: boolean
          last_survey_date?: string | null
          mjcc_username?: string | null
          org_id?: string
          points?: number
          role?: string
          streak?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      response_ratings: {
        Row: {
          dish_name: string
          id: string
          org_id: string
          rating: number
          response_id: string
          slot: string
        }
        Insert: {
          dish_name: string
          id?: string
          org_id: string
          rating: number
          response_id: string
          slot: string
        }
        Update: {
          dish_name?: string
          id?: string
          org_id?: string
          rating?: number
          response_id?: string
          slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_ratings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_ratings_response_id_fk"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_ratings_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "responses"
            referencedColumns: ["id"]
          },
        ]
      }
      responses: {
        Row: {
          feedback: string | null
          id: string
          idea: string | null
          menu_day: number | null
          org_id: string
          points_awarded: number
          session_id: string
          student_id: string
          submitted_at: string
        }
        Insert: {
          feedback?: string | null
          id?: string
          idea?: string | null
          menu_day?: number | null
          org_id: string
          points_awarded?: number
          session_id: string
          student_id: string
          submitted_at?: string
        }
        Update: {
          feedback?: string | null
          id?: string
          idea?: string | null
          menu_day?: number | null
          org_id?: string
          points_awarded?: number
          session_id?: string
          student_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_session_id_fk"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
        ]
      }
      session_members: {
        Row: {
          joined_at: string
          org_id: string
          session_id: string
          student_id: string
        }
        Insert: {
          joined_at?: string
          org_id: string
          session_id: string
          student_id: string
        }
        Update: {
          joined_at?: string
          org_id?: string
          session_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_members_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_members_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_members_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          closes_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          join_code: string
          menu_cycle_id: string | null
          menu_day: number | null
          opens_at: string | null
          org_id: string
          points_reward: number
          template_id: string | null
          title: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          join_code: string
          menu_cycle_id?: string | null
          menu_day?: number | null
          opens_at?: string | null
          org_id: string
          points_reward?: number
          template_id?: string | null
          title: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          join_code?: string
          menu_cycle_id?: string | null
          menu_day?: number | null
          opens_at?: string | null
          org_id?: string
          points_reward?: number
          template_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_menu_cycle_id_fkey"
            columns: ["menu_cycle_id"]
            isOneToOne: false
            referencedRelation: "menu_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      store_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          org_id: string
          stock: number | null
          token_cost: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          org_id: string
          stock?: number | null
          token_cost: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          org_id?: string
          stock?: number | null
          token_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_answers: {
        Row: {
          created_at: string
          id: string
          numeric_value: number | null
          option_values: string[] | null
          org_id: string
          question_id: string
          response_id: string
          text_value: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          numeric_value?: number | null
          option_values?: string[] | null
          org_id: string
          question_id: string
          response_id: string
          text_value?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          id?: string
          numeric_value?: number | null
          option_values?: string[] | null
          org_id?: string
          question_id?: string
          response_id?: string
          text_value?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "survey_answers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_answers_question_id_fk"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "survey_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "survey_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_answers_response_id_fk"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "responses"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_questions: {
        Row: {
          category: string | null
          created_at: string
          help_text: string | null
          id: string
          options: Json
          org_id: string
          position: number
          prompt: string
          required: boolean
          scale_max: number
          scale_min: number
          template_id: string
          type: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          help_text?: string | null
          id?: string
          options?: Json
          org_id: string
          position?: number
          prompt: string
          required?: boolean
          scale_max?: number
          scale_min?: number
          template_id: string
          type: string
        }
        Update: {
          category?: string | null
          created_at?: string
          help_text?: string | null
          id?: string
          options?: Json
          org_id?: string
          position?: number
          prompt?: string
          required?: boolean
          scale_max?: number
          scale_min?: number
          template_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_questions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_templates: {
        Row: {
          audience: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          org_id: string
          points_reward: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          org_id: string
          points_reward?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          org_id?: string
          points_reward?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          org_id: string
          student_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          org_id: string
          student_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      dish_rating_stats: {
        Row: {
          avg_rating: number | null
          category: string | null
          dish_key: string | null
          dish_name: string | null
          org_id: string | null
          votes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dish_ratings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_stats: {
        Row: {
          avg_rating: number | null
          dish_name: string | null
          org_id: string | null
          slot: string | null
          votes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "response_ratings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      student_roster: {
        Row: {
          created_at: string | null
          id: string | null
          orders: number | null
          org_id: string | null
          points: number | null
          responses: number | null
          streak: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          orders?: never
          org_id?: string | null
          points?: number | null
          responses?: never
          streak?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          orders?: never
          org_id?: string | null
          points?: number | null
          responses?: never
          streak?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      caller_org_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      join_session: { Args: { p_code: string }; Returns: string }
      redeem_item: { Args: { p_item_id: string }; Returns: string }
      submit_response: {
        Args: {
          p_answers?: Json
          p_feedback?: string
          p_idea?: string
          p_ratings: Json
          p_session_id: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Session = Database["public"]["Tables"]["sessions"]["Row"];
export type StoreItem = Database["public"]["Tables"]["store_items"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type DishStat = Database["public"]["Views"]["dish_stats"]["Row"];
export type MenuCycle = Database["public"]["Tables"]["menu_cycles"]["Row"];
export type MenuCycleDay = Database["public"]["Tables"]["menu_cycle_days"]["Row"];
export type SurveyTemplate = Database["public"]["Tables"]["survey_templates"]["Row"];
export type SurveyQuestion = Database["public"]["Tables"]["survey_questions"]["Row"];
